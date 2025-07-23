// //for all env variables imports
// require("dotenv").config();

// const redis =require('redis');

// const client = redis.createClient({ url: "rediss://" + process.env.REDIS_ENDPOINT+ ":6379"});

// //const client = redis.createClient({ });

// client.on('connect', function(){
//     console.log('Connected to Redis...');
// }); 

// client.on('error', (err) => console.log('Redis Client ', err));

// async function connectDatabase()
// {
//     await client.connect();
// }

// connectDatabase();

// module.exports = {client};