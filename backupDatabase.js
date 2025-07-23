// require("dotenv").config();
// const { exec } = require('child_process');
// const cron = require('node-cron');
// const AWS = require('aws-sdk');
// const fs = require('fs');
// const path = require('path');

// const s3 = new AWS.S3({
//   accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
// });

// cron.schedule(process.env.BACKUPTIME, () => backup());

// function backup() {
//   const backupTimestamp=new Date().getTime();
//   console.log("backupTimestamp: ",backupTimestamp);
  
//   const ARCHIVE_PATH = './' + `${backupTimestamp}.sql`;
//   console.log("ARCHIVE_PATH: ",ARCHIVE_PATH);

//   const username = process.env.DB_USER;
//   const database = process.env.DB_DATABASE;
//   const host = process.env.DB_HOST;
//   const port = process.env.DB_PORT;

//   // Set the environment variable for the password
//   process.env.PGPASSWORD = process.env.DB_PASSWORD;
//   console.log("process.env.PGPASSWORD: ",process.env.PGPASSWORD);
  
//   // Construct the pg_dump command
//   const command = `pg_dump -U ${username} -h ${host} -p ${port} -d ${database} -f ${ARCHIVE_PATH}`;
  
//   // Run the command
//   exec(command,(error, stderr) => {
    
//     if (error) {
//       console.error(`exec error: ${error}`);
//       return;
//     }
//     if (stderr) {
//       console.error(`stderr: ${stderr}`);
//       return;
//     }
//     console.log(`Backup completed: ✅`);
//     uploadToS3Bucket(ARCHIVE_PATH,process.env.FOLDER_NAME + backupTimestamp);
//   });
// }

// async function uploadToS3Bucket(pathToBinary,backupTimestamp) {
//   try {
//     path.basename(pathToBinary);
    
//     const uploadStream = fs.createReadStream(pathToBinary); // ✅ stream — no full read

//     const params = {
//       Bucket: process.env.AWS_S3_BUCKET_NAME,
//       Key: backupTimestamp.toString(),
//       Body: uploadStream,
//     };

//     s3.upload(params, (err, data) => {
//       if (err) 
//       {
//         console.error('Upload error:', err);
//       }
//       else 
//       {
//         console.log('Upload success:', data.Location);
//       }
//       fs.unlinkSync(pathToBinary);
//       console.log("file deleted from local public folder...");
//     });

//   } catch (error) {
//     console.log("Error in uploadtToS3Bucket: ",error);
//     fs.unlinkSync(pathToBinary);
//     console.log("file deleted from local public folder...");
//   }
// }
