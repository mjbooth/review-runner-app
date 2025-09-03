const { createWorker } = require('./dist/services/job-queue');

console.log('Starting simple test worker...');

// Test if we can create a worker for send-request
try {
  const worker = createWorker('send-request', async job => {
    console.log('Processing job:', job.id, job.data);
    return { success: true };
  });

  console.log('Worker created successfully');

  setTimeout(() => {
    console.log('Stopping test worker...');
    worker.close();
    process.exit(0);
  }, 5000);
} catch (error) {
  console.error('Failed to create worker:', error);
  process.exit(1);
}
