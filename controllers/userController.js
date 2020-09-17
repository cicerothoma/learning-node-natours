const multer = require('multer');
const sharp = require('sharp');
const User = require('./../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('./handlerFactory');

// Create a multer storage with filename and file destination
// Because we're resizing the images that are uploaded we don't need to save the images to our local disk |
// but instead we save it to memory as a buffer so that we can manipulate the file
// const multerStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'public/img/users');
//   },
//   filename: (req, file, cb) => {
//     const ext = file.mimetype.split('/')[1];
//     const name = `user-${req.user._id}-${Date.now()}`;
//     cb(null, `${name}.${ext}`);
//   },
// });

// Saving the image to memory as buffer
const multerStorage = multer.memoryStorage();

// Create a multer filter
const multerFilter = (req, file, cb) => {
  // Checks if the file uploaded is an image
  if (file.mimetype.startsWith('image')) {
    return cb(null, true);
  } else {
    return cb(
      new AppError('Not an image! Please upload only images', 400),
      false
    );
  }
};

// Configuring Multer Upload || Returns a middleware function
const upload = multer({ storage: multerStorage, fileFilter: multerFilter });

exports.uploadUserPhoto = upload.single('photo');

exports.resizeUserPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next();
  }
  // Store the file name into the req.file object
  req.file.filename = `user-${req.user._id}-${Date.now()}.jpeg`;
  await sharp(req.file.buffer)
    .resize(500, 500) // Resizes the Image
    .toFormat('jpeg') // Formats it to the specified extension
    .jpeg({ quality: 90 }) // Compresses it so it doesn't take up too much space
    .toFile(`public/img/users/${req.file.filename}`); // Save the converted file to the specified path
  next();
});

const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) {
      newObj[el] = obj[el];
    }
  });
  return newObj;
};

exports.getMe = (req, res, next) => {
  req.params.id = req.user._id;
  next();
};

exports.updateMe = catchAsync(async (req, res, next) => {
  // 1) Create error if user tries to update password
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /updateMyPassword',
        400
      )
    );
  }

  // 2) Filtered out unwanted fields that are not allowed to be updated
  const filteredBody = filterObj(req.body, 'name', 'email');
  // If image file exists -- Add the photo to the filteredBody object to update user data
  if (req.file) {
    filteredBody.photo = req.file.filename;
  }

  // 3) Update User document
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser,
    },
  });
});

exports.createUser = (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: 'This route is not defined! Please use /signup instead',
  });
};

exports.deleteMe = catchAsync(async (req, res, next) => {
  // 1) Get User and update
  const user = await User.findByIdAndUpdate(req.user.id, { active: false });

  // 2) send response to user
  res.status(204).json({
    status: 'success',
    message: 'Your account has been succesfully deleted!',
  });
});

exports.getAllUsers = factory.getAll(User);
exports.getUser = factory.getOne(User);

// Do not attempt to change user password with this!!!!
exports.updateUser = factory.updateOne(User);
exports.deleteUser = factory.deleteOne(User);
