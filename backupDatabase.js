require("dotenv").config();
const { exec } = require('child_process');
const cron = require('node-cron');
const AWS = require('aws-sdk');
const fs = require('fs');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
});

cron.schedule(process.env.BACKUPTIME, () => backup());

function backup() {
  const backupTimestamp=new Date().getTime();
  const ARCHIVE_PATH = './public/' + `${backupTimestamp}.sql`;
  
  const username = process.env.DB_USER;
  const database = process.env.DB_DATABASE;
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT;

  // Set the environment variable for the password
  process.env.PGPASSWORD = process.env.DB_PASSWORD;

  // Construct the pg_dump command
  const command = `pg_dump -U ${username} -h ${host} -p ${port} -d ${database} -f ${ARCHIVE_PATH}`;

  // Run the command
  exec(command,(error, stderr) => {
    
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    console.log(`Backup completed: ✅`);
    uploadtToS3Bucket(ARCHIVE_PATH,'devnet-test/'+backupTimestamp);
  });
}

async function uploadtToS3Bucket(pathToBinary,backupTimestamp) {

  const file = fs.readFileSync(pathToBinary);
  console.log("Database's Data: ",file);
  
  const uploadedImage = await s3.upload({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: backupTimestamp.toString(),
    Body: file,
  }).promise();

  console.log("uploadedImage: ",uploadedImage.Location);
  console.log("file uploaded to AWS S3 Bucket...");

  fs.unlinkSync(pathToBinary);
  console.log("file deleted from local public folder...");
}

