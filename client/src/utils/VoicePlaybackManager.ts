/**
 * VoicePlaybackManager - Advanced voice playback control
 * 
 * Provides granular control over text-to-speech playback with features like:
 * - Content chunking for better control
 * - Pause/resume functionality
 * - Progress tracking
 * - Event callbacks
 */
export class VoicePlaybackManager {
  private utterances: SpeechSynthesisUtterance[] = [];
  private currentIndex = 0;
  private isPaused = false;
  private isPlaying = false;
  
  constructor(
    private synth: SpeechSynthesis,
    private onProgress?: (current: number, total: number) => void,
    private onComplete?: () => void
  ) {}

  /**
   * Load content and split into manageable chunks
   */
  loadContent(text: string, chunkSize: number = 500, lang: string = 'ar-SA') {
    const chunks = this.splitIntoChunks(text, chunkSize);
    this.utterances = chunks.map(chunk => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = lang;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      return utterance;
    });
    this.currentIndex = 0;
    this.isPaused = false;
    this.isPlaying = false;
  }

  /**
   * Start or resume playback
   */
  play() {
    if (this.utterances.length === 0) {
      console.warn('No content loaded');
      return;
    }

    if (this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
      this.isPlaying = true;
    } else if (!this.isPlaying) {
      this.isPlaying = true;
      this.playChunk(this.currentIndex);
    }
  }

  /**
   * Pause playback
   */
  pause() {
    if (this.isPlaying && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
    }
  }

  /**
   * Stop playback and reset
   */
  stop() {
    this.synth.cancel();
    this.currentIndex = 0;
    this.isPaused = false;
    this.isPlaying = false;
  }

  /**
   * Resume playback if paused
   */
  resume() {
    if (this.isPaused) {
      this.play();
    }
  }

  /**
   * Get current playback state
   */
  getState() {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentIndex: this.currentIndex,
      totalChunks: this.utterances.length,
      progress: this.utterances.length > 0 
        ? (this.currentIndex / this.utterances.length) * 100 
        : 0,
    };
  }

  /**
   * Play a specific chunk
   */
  private playChunk(index: number) {
    if (index >= this.utterances.length) {
      this.isPlaying = false;
      this.onComplete?.();
      return;
    }

    const utterance = this.utterances[index];
    
    utterance.onstart = () => {
      this.onProgress?.(index + 1, this.utterances.length);
    };

    utterance.onend = () => {
      if (!this.isPaused) {
        this.currentIndex++;
        this.playChunk(this.currentIndex);
      }
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      this.isPlaying = false;
    };

    this.synth.speak(utterance);
  }

  /**
   * Split text into chunks by sentences or size limit
   */
  private splitIntoChunks(text: string, maxSize: number): string[] {
    const chunks: string[] = [];
    
    // Try to split by sentences first
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    let currentChunk = '';
    
    sentences.forEach(sentence => {
      if ((currentChunk + sentence).length > maxSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          // Sentence is too long, split it by size
          const parts = sentence.match(new RegExp(`.{1,${maxSize}}`, 'g')) || [sentence];
          parts.forEach((part, i) => {
            if (i === parts.length - 1) {
              currentChunk = part;
            } else {
              chunks.push(part.trim());
            }
          });
        }
      } else {
        currentChunk += sentence;
      }
    });
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Skip to next chunk
   */
  next() {
    if (this.currentIndex < this.utterances.length - 1) {
      this.synth.cancel();
      this.currentIndex++;
      if (this.isPlaying) {
        this.playChunk(this.currentIndex);
      }
    }
  }

  /**
   * Skip to previous chunk
   */
  previous() {
    if (this.currentIndex > 0) {
      this.synth.cancel();
      this.currentIndex--;
      if (this.isPlaying) {
        this.playChunk(this.currentIndex);
      }
    }
  }
}
