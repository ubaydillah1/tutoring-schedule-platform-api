import { Router } from "express";
import { AuthController } from "../controller/auth.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";

const router = Router();

router.post("/login", asyncHandler(AuthController.login));
router.post("/register", asyncHandler(AuthController.register));
router.delete("/logout", asyncHandler(AuthController.logout));

export default router;
