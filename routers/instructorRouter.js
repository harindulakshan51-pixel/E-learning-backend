import express from "express";
import {
  getInstructors,
  getInstructorById,
  createInstructor,
  updateInstructor,
  deleteInstructor,
} from "../controllers/instructorController.js";

const instructorRouter = express.Router();

instructorRouter.get("/", getInstructors);
instructorRouter.get("/:instructorId", getInstructorById);
instructorRouter.post("/", createInstructor);
instructorRouter.put("/:instructorId", updateInstructor);
instructorRouter.delete("/:instructorId", deleteInstructor);

export default instructorRouter;