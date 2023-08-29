const bcrypt = require("bcrypt");
const jwtUtils = require("../utils/jwtUtils");
const User = require("../models/user");
const VerificationToken = require("../models/verifictionToken");

const {
  transporter,
  successfulRegister,
} = require("../utils/nodemailerConfig");

require("dotenv").config();
const path = require("path");

exports.registerUser = async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  try {
    const existingUser = await User.findOne({ email: email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash the password and create a new user
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({
      email: email,
      password: hashedPassword,
      active: false,
    });

    const token = jwtUtils.generateToken();
    const verificationToken = new VerificationToken({
      userId: user._id,
      token: token,
    });
    await verificationToken.save();

    const verificationLink = `${req.protocol}://${req.get(
      "host"
    )}/users/verify/${user._id}/${token}`; // Construct the verification link from the request origin and the user id and token
    const mailOptions = successfulRegister(user, verificationLink);

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log("Error sending email:", error);
      } else {
        console.log("Email sent:", info.response);
      }
    });

    // Save the user to the database and return a success message
    await user.save();
    res.status(201).json({
      message:
        "User registered successfully. Please check your email for verification link.",
      verificationLink,
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error registering user" });
  }
};

exports.loginUser = async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwtUtils.generateToken(user.email);
    res
      .status(200)
      .json({ message: "User Logged In", user: user.email, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error during login" });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    // Get the user id and token from the request parameters
    const userId = req.params.userId;
    const token = req.params.token;

    // Find the verification token document by user id and token in the database
    const verificationToken = await VerificationToken.findOne({
      userId: userId,
      token: token,
    });

    // If no verification token is found, return an error message
    if (!verificationToken) {
      return res
        .status(404)
        .json({ message: "Invalid or expired verification link" });
    }

    // Find the user document by user id in the database
    const user = await User.findById(userId);

    // If no user is found, return an error message
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If the user is already active, return a success message
    if (user.active) {
      return res.status(200).json({ message: "User already verified" });
    }

    // Set the user's active flag to true and save the user document to the database
    user.active = true;
    await user.save();

    return res.status(200).json({
      message: "User verified successfully",
      user: user,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


