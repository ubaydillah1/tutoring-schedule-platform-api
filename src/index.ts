import { type NextFunction, type Request, type Response } from "express";
import express from "express";
import studentRoutes from "./routes/student.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import authRoutes from "./routes/auth.routes.js";
import cors from "cors";
import { AppError } from "./utils/errors.js";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);
app.use(express.json());

app.use("/api", studentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

app.use((err: Error, __: Request, res: Response, _: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      message: err.message,
    });
    return;
  }

  res.status(500).json({ message: err.message });
});

app.use((_: Request, res: Response) => {
  res.status(404).json({ message: "Not Found" });
});

app.listen(5000, () => {
  console.log("http://localhost:5000");
});
