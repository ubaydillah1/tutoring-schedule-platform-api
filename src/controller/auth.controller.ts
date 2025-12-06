// controllers/auth.controller.ts
import { type Request, type Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
} from "../utils/errors.js";

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET as string;
const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "token";
const COOKIE_MAX_AGE = 1 * 24 * 60 * 60 * 1000; // 1 day

function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function safeUser(user: any) {
  const { password, ...rest } = user;
  return rest;
}

export const AuthController = {
  // REGISTER ADMIN
  async register(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new BadRequestError("email and password are required");
    }

    // check existing email
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError("Email already in use");
    }

    // hash password
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.admin.create({
      data: { email, password: hashed },
    });

    const token = signToken({ userId: user.id });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
    });

    return res.status(201).json({
      message: "Registered",
      data: safeUser(user),
    });
  },

  // LOGIN ADMIN
  async login(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new BadRequestError("email and password are required");
    }

    const user = await prisma.admin.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const token = signToken({ userId: user.id });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
    });

    return res.json({
      message: "Logged in",
      data: safeUser(user),
    });
  },

  // LOGOUT
  async logout(_req: Request, res: Response) {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    return res.json({ message: "Logged out" });
  },
};
