const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3003;
const { AbortController } = require('abort-controller');
const { v4: uuidv4 } = require('uuid');
const ThrottleTransform = require('./transaformProgress');
const removeFile = require('./helper/fileHelper');

// In-memory object to track download progress by URL
let downloadProgress = {};
let abortControllers = {};
global.__basedir = __dirname;
app.use(express.json());

async function downloadFile(url, outputPath, downloadId, abortController) {
  const fileName = path.basename(outputPath);

  console.log(`Starting download from ${url}`);

  const writer = fs.createWriteStream(outputPath);

  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      signal: abortController.signal,
    });

    const totalSize = parseInt(response.headers['content-length'], 10); // Get total file size
    let downloadedSize = 0;

    downloadProgress[downloadId] = { totalSize, downloadedSize, fileName };

    response.data.on('data', (chunk) => {
      if (downloadProgress[downloadId]) {

        downloadedSize += chunk.length;
        const { percentage } = progressBar(downloadProgress[downloadId]);
        console.log(percentage, ' %')

        downloadProgress[downloadId].downloadedSize = downloadedSize;
      }
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`File ${fileName} downloaded successfully to ${outputPath}`);
        resolve(fileName);
        delete downloadProgress[downloadId];
        delete abortControllers[downloadId];

      });

      writer.on('error', (err) => {
        fs.unlink(outputPath, (unlinkErr) => {
          if (unlinkErr) console.error(`Error deleting file: ${unlinkErr.message}`);
        });
        reject(`Error downloading file: ${err.message}`);
        delete downloadProgress[downloadId];
        delete abortControllers[downloadId];

      });
    });
  } catch (error) {
    fs.unlink(outputPath, (unlinkErr) => {
      if (unlinkErr) console.error(`Error deleting file: ${unlinkErr.message}`);
    });
    delete downloadProgress[downloadId];
    delete abortControllers[downloadId];

    if (error.code === 'ERR_CANCELED') {
      throw new Error(`Download canceled: ${fileName}`);
    } else {
      throw new Error(`Error occurred while downloading file: ${error.message}`);
    }
  }
}

app.post('/download', (req, res) => {
  const { url, fileName } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const finalFileName = fileName || path.basename(url);
  const outputPath = path.resolve(__dirname, 'downloads', finalFileName);

  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }
  const downloadId = uuidv4();

  const abortController = new AbortController();
  abortControllers[downloadId] = abortController;

  downloadFile(url, outputPath, downloadId, abortController)
    .then(() => console.log(`Background download for ${finalFileName} completed.`))
    .catch((error) => console.error(`Background download error: ${error.message}`));

  return res.status(200).json({ message: 'Download started in the background', finalFileName, id: downloadId });
});

app.get('/download-file/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const path = `${__basedir}/downloads/${id}`;
    const fileSize = fs.statSync(path).size;
    // const file = 'Users.xlsx';
    fs.access(path, fs.constants.F_OK, function (error) {
      if (error) {
        return res.status(500).json({ message: error })
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename=${path}`,
        'Content-Length': fileSize
      });
      fs.createReadStream(path).pipe(res);
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error' })
  }
})
app.get('/download-slow/:id', (req, res) => {
  try {
    const { id } = req.params;
    const filePath = `${__basedir}/downloads/${id}`;
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error',(err)=>{
      console.log('ERRRR',err)
    })
    const fileSize = fs.statSync(filePath).size;
    const speedKBPerSeconds = 50000;

    
    // const throttleTransform = new ThrottleTransform(1024 * speedKBPerSeconds, fileSize); // 50 KB/s

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
      'Content-Length': fileSize

    });

    // fileStream.pipe(throttleTransform).pipe(res);
    fileStream.pipe(res);

  } catch (error) {
    return res.status(500).json({ message: 'Error:'+error })
  }
})

app.get('/delete-file/:id', (req, res) => {
  const { id } = req.params;
  const filePath = `${__basedir}/downloads/${id}`;
  removeFile(filePath, (err) => {
    if (err) {
      return res.status(500).json({ message: err })
    }
    return res.status(200).json({ message: 'File removed' })
  })
})

function progressBar(progress) {
  const { totalSize, downloadedSize } = progress;
  const percentage = ((downloadedSize / totalSize) * 100).toFixed(2);
  return { percentage, totalSize, downloadProgress };
}
app.get('/download-progress/:id', (req, res) => {
  // const { url } = req.query;

  // if (!url) {
  //   return res.status(400).json({ error: 'URL query parameter is required' });
  // }
  const downloadId = req.params.id;

  const progress = downloadProgress[downloadId];

  if (!progress) {
    return res.status(404).json({ message: 'No ongoing download for the provided URL' });
  }

  // const { totalSize, downloadedSize } = progress;
  // const percentage = ((downloadedSize / totalSize) * 100).toFixed(2);
  const { percentage, totalSize, downloadedSize } = progressBar(progress);


  return res.status(200).json({
    fileName: progress.fileName,
    totalSize,
    downloadedSize,
    percentage: `${percentage}%`
  });
});

app.get('/cancel-download/:id', (req, res) => {
  // const { url } = req.body;

  // if (!url) {
  //   return res.status(400).json({ error: 'URL is required' });
  // }
  const downloadId = req.params.id;

  const abortController = abortControllers[downloadId];
  const progress = downloadProgress[downloadId];
  const outputPath = path.resolve(__dirname, 'downloads', progress ? progress.fileName : '');

  if (!abortController) {
    return res.status(404).json({ message: 'No ongoing download to cancel for the provided URL' });
  }

  setTimeout(() => {
    if (fs.existsSync(outputPath)) {
      fs.unlink(outputPath, (unlinkErr) => {
        if (unlinkErr) console.error(`Error deleting file: ${unlinkErr.message}`);
      });
    }

    delete abortControllers[downloadId];
    delete downloadProgress[downloadId];
  }, 1000);

  return res.status(200).json({ message: `Download for ${downloadId} has been canceled` });
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
