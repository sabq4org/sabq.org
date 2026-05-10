import { EventEmitter } from 'events';

export interface Job {
  id: string;
  type: string;
  data: any;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

class JobQueue extends EventEmitter {
  private jobs = new Map<string, Job>();
  private processing = false;

  async add(type: string, data: any): Promise<string> {
    const id = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const job: Job = { id, type, data, status: 'queued', createdAt: new Date() };
    this.jobs.set(id, job);
    
    console.log(`[JobQueue] Added job ${id} of type ${type}`);
    
    // Start processing next job (non-blocking)
    setImmediate(() => this.processNext());
    
    return id;
  }

  async getStatus(jobId: string): Promise<Job | null> {
    return this.jobs.get(jobId) || null;
  }

  private async processNext() {
    if (this.processing) {
      console.log('[JobQueue] Already processing a job, skipping processNext');
      return;
    }
    
    const queuedJob = Array.from(this.jobs.values()).find(j => j.status === 'queued');
    if (!queuedJob) {
      console.log('[JobQueue] No queued jobs found');
      return;
    }

    this.processing = true;
    queuedJob.status = 'processing';
    
    console.log(`[JobQueue] Processing job ${queuedJob.id} of type ${queuedJob.type}`);
    
    try {
      await this.executeJob(queuedJob);
      queuedJob.status = 'completed';
      queuedJob.completedAt = new Date();
      console.log(`[JobQueue] Job ${queuedJob.id} completed successfully`);
    } catch (error: any) {
      queuedJob.status = 'failed';
      queuedJob.error = error.message;
      console.error(`[JobQueue] Job ${queuedJob.id} failed:`, error);
    } finally {
      this.processing = false;
      
      // Clean up old completed/failed jobs (keep last 100)
      const allJobs = Array.from(this.jobs.entries());
      if (allJobs.length > 100) {
        const jobsToRemove = allJobs
          .filter(([, job]) => job.status === 'completed' || job.status === 'failed')
          .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime())
          .slice(0, allJobs.length - 100);
        
        jobsToRemove.forEach(([id]) => this.jobs.delete(id));
      }
      
      // Process next job if any (non-blocking)
      setImmediate(() => this.processNext());
    }
  }

  private async executeJob(job: Job) {
    this.emit('job:execute', job);
  }

  onExecute(handler: (job: Job) => Promise<void>) {
    this.on('job:execute', handler);
  }
}

export const jobQueue = new JobQueue();
