const { promisify } = require('util');
const crypto = require('crypto');
const User = require('./../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const SendEmail = require('./../utils/email');
const sendEmail = require('./../utils/email');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createAndSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  const cookieOptions = {
    httpOnly: true,
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
  };

  // Send JSON Web Token Via Cookie || Activate the secure flag in production environment
  if (process.env.NODE_ENV.trim() === 'production') {
    cookieOptions.secure = true;
  }
  res.cookie('jwt', token, cookieOptions);

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const userData = { ...req.body };
  const newUser = await User.create({
    name: userData.name,
    email: userData.email,
    password: userData.password,
    passwordConfirm: userData.passwordConfirm,
    passwordChangedAt: userData.passwordChangedAt,
  });

  createAndSendToken(newUser, 201, res);
});

exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password actually exists
  if (!email || !password) {
    return next(new AppError(`Please Provide Email and Password`, 400));
  }

  // 2) Check if the user exists and password is correct

  // The ('+password') on the select query is to include the field that is not selected by default
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError(`Incorrect Email or Password`, 401));
  }

  // 3) If everything is okay, send token to client
  createAndSendToken(user, 200, res);
};

// Middleware function that checks if the user has the permission to view protected routes
exports.protect = catchAsync(async (req, res, next) => {
  // 1) Get the token and ckeck if it exists
  let token = null;
  console.log(req.headers);
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  console.log(token);

  if (!token) {
    return next(
      new AppError(
        'You are not logged in! Please login to access this route',
        401
      )
    );
  }
  // 2) Verification of the token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if users still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError('The user belonging to this token no longer exist.', 401)
    );
  }

  // console.log(user);
  // 4) Check if users changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please login again', 401)
    );
  }

  // Grant Access to protected route
  req.user = currentUser;
  next();
});

exports.restrictTo = (...roles) => (req, res, next) => {
  if (roles.includes(req.user.role) === false) {
    return next(
      new AppError('You do not have permission to perform this action', 403)
    );
  }

  next();
};

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on provided email
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    return next(new AppError(`Can't find user with the email: ${email}`, 404));
  }
  // 2) Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send back the reset token to the user email
  const resetURL = `${req.protocol}://${req.get(
    'host'
  )}/api/v1/users/resetPassword/${resetToken}`;

  const message = `Forgot your password? Submit  a PATCH request with your new password and passwordConfirm to ${resetURL}. \nIf you didn't forget your password please ignore this email`;
  try {
    await sendEmail({
      email: user.email,
      subject: 'Your Password Reset Token (Valid for 10 minutes)',
      message,
    });

    res.status(200).json({
      status: 'success',
      message:
        'Your Password reset token has been sent to the email address you specified',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        'There was an error sending the email. Please try again later!',
        500
      )
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get Users based on the token
  const encryptedPasswordResetToken = crypto
    .createHash('sha512')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: encryptedPasswordResetToken,
  });

  // 2) If token has not expired and there is a user (set the password)
  if (!user) {
    return next(new AppError(`Token is invalid or has expired`, 400));
  }

  if (Date.now() > user.passwordResetExpires) {
    return next(
      new AppError(
        'This token is already expired. Please restart the process again',
        401
      )
    );
  }
  const newPassword = req.body.password;
  const newPasswordConfirm = req.body.passwordConfirm;
  user.password = newPassword;
  user.passwordConfirm = newPasswordConfirm;

  // Resets token and token expiry date.
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  // 3) Update the changedPasswordAt property for the user
  // user.passwordChangedAt = Date.now(); // Code no longer needed because we used a pre save hook for this. (check out userSchema for clarity)

  await user.save();

  // 4) Log the user in
  createAndSendToken(user, 200, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get the user from the collection
  const user = await User.findById(req.user.id).select('+password');
  // 2) Check if the post password is correct
  const isPasswordCorrect = await user.correctPassword(
    req.body.passwordCurrent,
    user.password
  );

  if (isPasswordCorrect === false) {
    return next(new AppError('Your current password is wrong', 401));
  }
  // 3) Update the password
  user.password = req.body.newPassword;
  user.passwordConfirm = req.body.newPasswordConfirm;
  await user.save();
  //  4) Log User In. Send JWT

  createAndSendToken(user, 200, res);
});