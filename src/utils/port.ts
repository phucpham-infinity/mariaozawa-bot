import { createServer } from 'net';
import logger from './logger';

export async function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.listen(startPort, () => {
      const port = (server.address() as any)?.port;
      server.close(() => {
        resolve(port);
      });
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${startPort} is busy, trying ${startPort + 1}...`);
        findAvailablePort(startPort + 1)
          .then(resolve)
          .catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

export async function killProcessOnPort(port: number): Promise<void> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Kill process on port (works on macOS/Linux)
    await execAsync(`lsof -ti:${port} | xargs kill -9`);
    logger.info(`Killed process on port ${port}`);
  } catch (error) {
    // Ignore errors if no process is running on the port
    logger.debug(`No process found on port ${port}`);
  }
}
