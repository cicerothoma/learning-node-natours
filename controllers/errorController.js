const AppError = require('./../utils/appError');

// Handling Errors with Express error handling middleware
// To use Express error handling middleware we specify 4 arguments in the callback function

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.keyValue.name;
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((val) => val.message);
  // Research On Object.keys && Object.values later
  // console.log(Object.values(err.errors));
  // console.log(err);
  const message = `Invalid Input Data: ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please Login again', 401);

const handleJWTExpiredError = (err) =>
  new AppError(
    `Token Expired. Date Expired: ${err.expiredAt}. Please Login Again`,
    401
  );

const sendErrorDev = (err, req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      error: err,
      stack: err.stack,
    });
  } else {
    res.status(err.statusCode).render('error', {
      title: 'Something went wrong',
      msg: err.message,
    });
  }
};

const sendErrorProd = (err, req, res) => {
  // Operational, Trusted error: send Message to Client
  if (err.isOperational) {
    if (req.originalUrl.startsWith('/api')) {
      // API
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    } else {
      // RENDERED WEBSITE
      res.status(err.statusCode).render('error', {
        title: 'Something went wrong!',
        msg: err.message,
      });
    }
  } else {
    // Programming or other error, not trusted: Don't leak details to client
    // 1) Log Error
    console.dir(err);

    // 2) Send generic error message
    // API
    if (req.originalUrl.startsWith('/api')) {
      res.status(500).json({
        status: 'error',
        message: 'Something went very wrong',
      });
    } else {
      // RENDERED WEBSITE
      res.status(500).render('error', {
        title: 'Something went very wrong',
        msg: 'Please try again later',
      });
    }
  }
};

// To Use Error Handling Middleware all we need to do is to define 4 arguments in
// middleware function with the first argument as the error object

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV.trim() === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV.trim() === 'production') {
    let error = { ...err };
    error.message = err.message;
    if (error.kind === 'ObjectId') {
      error = handleCastErrorDB(error);
    }
    if (error.code === 11000) {
      error = handleDuplicateFieldsDB(error);
    }
    if (
      error._message &&
      error._message.toLowerCase().includes('validation failed')
    ) {
      error = handleValidationErrorDB(error);
    }
    if (error.name === 'JsonWebTokenError') {
      error = handleJWTError();
    }
    if (error.name === 'TokenExpiredError') {
      error = handleJWTExpiredError(error);
    }
    sendErrorProd(error, req, res);
  }
};
