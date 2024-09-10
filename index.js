const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3003;
const { AbortController } = require('abort-controller');
const { v4: uuidv4 } = require('uuid'); 

// In-memory object to track download progress by URL
let downloadProgress = {};
let abortControllers = {};

app.use(express.json()); 

async function downloadFile(url, outputPath,downloadId,abortController) {
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
      downloadedSize += chunk.length;
      downloadProgress[downloadId].downloadedSize = downloadedSize;
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
        reject(`Error downloading file: ${err.message}`);
        delete downloadProgress[downloadId]; 
        delete abortControllers[downloadId]; 

      });
    });
  } catch (error) {
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
  const { url,fileName } = req.body;

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

   downloadFile(url, outputPath,downloadId,abortController)
    .then(() => console.log(`Background download for ${finalFileName} completed.`))
    .catch((error) => console.error(`Background download error: ${error.message}`));

  return res.status(200).json({ message: 'Download started in the background', finalFileName,id:downloadId });
});

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

  const { totalSize, downloadedSize } = progress;
  const percentage = ((downloadedSize / totalSize) * 100).toFixed(2);

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

  if (!abortController) {
    return res.status(404).json({ message: 'No ongoing download to cancel for the provided URL' });
  }

  abortController.abort();
  delete abortControllers[downloadId]; 
  delete downloadProgress[downloadId]; 

  return res.status(200).json({ message: `Download for ${downloadId} has been canceled` });
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
