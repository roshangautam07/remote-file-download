const http = require('http');
const fs = require('fs');
const { Transform } = require('stream');
const path = require('path');

// ThrottleTransform stream to control the speed
 class ThrottleTransform extends Transform {
  constructor(bytesPerSecond, totalSize, options) {
    super(options);
    this.bytesPerSecond = bytesPerSecond;
    this.totalSize = totalSize;
    this.startTime = Date.now();
    this.totalBytes = 0;
  }

  _transform(chunk, encoding, callback) {
    this.totalBytes += chunk.length;
    const elapsedTime = (Date.now() - this.startTime) / 1000;
    const expectedTime = this.totalBytes / this.bytesPerSecond;

    if (elapsedTime < expectedTime) {
      const delay = expectedTime - elapsedTime;
      setTimeout(() => {
        this.showProgress();
        callback(null, chunk);
      }, delay * 1000);
    } else {
      this.showProgress();
      callback(null, chunk);
    }
  }

  showProgress() {
    const percent = ((this.totalBytes / this.totalSize) * 100).toFixed(2);
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`Progress: ${percent}%`);
  }

  _flush(callback) {
    process.stdout.write('\nDownload complete.\n');
    callback();
  }
}

module.exports = ThrottleTransform;
// const server = http.createServer((req, res) => {
//   const filePath = 'Inside Out 2 (2024).mp4';
//   const fileStream = fs.createReadStream(filePath);
//   const fileSize = fs.statSync(filePath).size;


//   const throttleTransform = new ThrottleTransform(1024 * 50, fileSize); // 50 KB/s

//   res.writeHead(200, {
//     'Content-Type': 'application/zip',
//     'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
//         'Content-Length': fileSize

//   });

//   fileStream.pipe(throttleTransform).pipe(res);
// });

// server.listen(3000, () => {
//   console.log('Server is listening on port 3000');
// });

