import mongoose from "mongoose";

const instructorSchema = new mongoose.Schema({
  instructorId: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  specialty: {
    type: String,
    required: true,
    enum: ["Design", "Development", "Analysis", "Other"],
    default: "Other",
  },
  bio: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    required: false,
    default: "",
  },
  rating: {
    type: Number,
    required: false,
    default: 0,
  },
  students: {
    type: String,
    required: false,
    default: "0",
  },
  courses: {
    type: Number,
    required: false,
    default: 0,
  },
});

const Instructor = mongoose.model("instructor", instructorSchema);
export default Instructor;