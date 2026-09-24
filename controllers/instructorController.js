import Instructor from "../models/instructor.js";

// GET ALL — public
export async function getInstructors(req, res) {
  try {
    const instructors = await Instructor.find();
    res.status(200).json(instructors);
  } catch (error) {
    res.status(500).json({ message: "Error fetching instructors", error: error.message });
  }
}

// GET ONE — public
export async function getInstructorById(req, res) {
  try {
    const instructor = await Instructor.findOne({ instructorId: req.params.instructorId });
    if (!instructor) return res.status(404).json({ message: "Instructor not found" });
    res.status(200).json(instructor);
  } catch (error) {
    res.status(500).json({ message: "Error fetching instructor", error: error.message });
  }
}

// CREATE — admin only
export async function createInstructor(req, res) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const existing = await Instructor.findOne({ instructorId: req.body.instructorId });
    if (existing) return res.status(400).json({ message: "Instructor ID already exists" });

    const instructor = new Instructor(req.body);
    await instructor.save();
    res.status(200).json({ message: "Instructor created successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error creating instructor", error: error.message });
  }
}

// UPDATE — admin only
export async function updateInstructor(req, res) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const instructor = await Instructor.findOne({ instructorId: req.params.instructorId });
    if (!instructor) return res.status(404).json({ message: "Instructor not found" });

    if (req.body.instructorId) delete req.body.instructorId;

    await Instructor.updateOne({ instructorId: req.params.instructorId }, req.body);
    res.status(200).json({ message: "Instructor updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error updating instructor", error: error.message });
  }
}

// DELETE — admin only
export async function deleteInstructor(req, res) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const instructor = await Instructor.findOne({ instructorId: req.params.instructorId });
    if (!instructor) return res.status(404).json({ message: "Instructor not found" });

    await Instructor.deleteOne({ instructorId: req.params.instructorId });
    res.status(200).json({ message: "Instructor deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting instructor", error: error.message });
  }
}