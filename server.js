const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });

// We can handle uncaught exceptions globally by using events and events listener
process.on('uncaughtException', (err) => {
  console.log(err);
  console.log('UNCAUGHT EXCEPTION!! Shuting Down!!');
  process.exit();
});

const app = require('./app');

const DB = process.env.DATABASE_LOCAL;

mongoose
  .connect(
    DB,
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useCreateIndex: true,
    },
    (err) => {
      if (err) {
        console.log(err);
      }
    }
  )
  .then(() => {
    console.log('DB Connection Successful');
  })
  .catch((err) => console.log(err));

const port = process.env.PORT;

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Application running on port ${port}`);
});

// We Can use Events and Events Listener to globally handle every unhandled promise rejections

process.on('unhandledRejection', (err) => {
  console.log(err.name, err.message);
  console.log('UNHANDLED REJECTION! Shutting Down....');
  server.close(() => {
    process.exit(1);
  });
});