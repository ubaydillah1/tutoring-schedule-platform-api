import { Router } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { AdminController } from "../controller/admin.controller.js";

const router = Router();

router.post("/subjects", asyncHandler(AdminController.createSubject));
router.get("/subjects", asyncHandler(AdminController.listSubjects));
router.delete("/subjects/:id", asyncHandler(AdminController.deleteSubject));

router.post("/classes", asyncHandler(AdminController.createClass));
router.get("/classes", asyncHandler(AdminController.listClasses));
router.delete("/classes/:id", asyncHandler(AdminController.deleteClass));

router.get("/sessions", asyncHandler(AdminController.getSessionsByDate));
router.put("/sessions/:slotId", asyncHandler(AdminController.updateSession));

router.post("/tutors", asyncHandler(AdminController.createTutor));
router.get("/tutors", asyncHandler(AdminController.listTutors));
router.delete("/tutors/:id", asyncHandler(AdminController.deleteTutor));

export default router;
