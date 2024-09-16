const fs = require('fs');
const removeFile = (filePath,callback)=>{
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) {
          console.error(`Error deleting file: ${unlinkErr.message}`);
          return callback(null,false)
          }
          return callback(null,true)
        });
      }
}

module.exports = removeFile;