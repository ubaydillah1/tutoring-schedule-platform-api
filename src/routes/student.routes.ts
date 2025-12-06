import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { StudentController } from "../controller/student.controller.js";

const router = Router();

router.post("/form", asyncHandler(StudentController.create));
router.get(
  "/upcomming-sessions",
  asyncHandler(StudentController.listUpcomingSessions)
);

router.get("/sessions", asyncHandler(StudentController.availableSessions));

export default router;
