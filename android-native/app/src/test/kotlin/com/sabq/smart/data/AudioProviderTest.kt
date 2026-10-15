package com.sabq.smart.data

import com.sabq.smart.data.audio.AudioPlayerController
import org.junit.Assert.*
import org.junit.Test

/** إسناد «الصوت عبر HUMAIN» — رأس X-TTS-Provider وامتداد الملف المؤقت (الدفعة 2). */
class AudioProviderTest {
    @Test fun providerNameIsLowercasedAndTrimmed() {
        assertEquals("humain", AudioPlayerController.providerName(" HUMAIN "))
        assertEquals("elevenlabs", AudioPlayerController.providerName("elevenlabs"))
        assertNull(AudioPlayerController.providerName(""))
        assertNull(AudioPlayerController.providerName(null))
        assertTrue(AudioPlayerController.State(playingSlug = "x", provider = "humain").isHumain)
        assertFalse(AudioPlayerController.State(playingSlug = "x", provider = "google").isHumain)
    }

    @Test fun fileExtensionFollowsContentType() {
        assertEquals("wav", AudioPlayerController.fileExtension("audio/wav"))
        assertEquals("mp3", AudioPlayerController.fileExtension("audio/mpeg"))
        assertEquals("m4a", AudioPlayerController.fileExtension("audio/mp4"))
        assertEquals("ogg", AudioPlayerController.fileExtension("audio/ogg"))
        assertEquals("mp3", AudioPlayerController.fileExtension(null))
    }
}
