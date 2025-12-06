// controllers/student.controller.ts
import { type Request, type Response } from "express";
import prisma from "../config/prisma.js";
import { BadRequestError, ConflictError } from "../utils/errors.js";

export const StudentController = {
  // CREATE REGISTRATION (no login)
  async create(req: Request, res: Response) {
    const { name, classId, sessionId, date, materi } = req.body;

    const missing = [];
    if (!name) missing.push("name");
    if (!classId) missing.push("classId");
    if (!sessionId) missing.push("sessionId");
    if (!date) missing.push("date");

    if (missing.length > 0) {
      throw new BadRequestError(`Missing fields: ${missing.join(", ")}`);
    }

    // SAFE PARSE DATE (no timezone shift)
    const [y, m, d] = date.split("-").map(Number);
    const targetDate = new Date(Date.UTC(y, m - 1, d));

    // count tutors for this session on THIS DATE
    const tutorCount = await prisma.tutorSession.count({
      where: { sessionId, date: targetDate },
    });

    const maxStudents = tutorCount * 10;

    // count current registrations
    const currentCount = await prisma.registration.count({
      where: { sessionId, date: targetDate },
    });

    if (currentCount >= maxStudents) {
      throw new ConflictError("Sesi ini sudah penuh");
    }

    const newReg = await prisma.registration.create({
      data: {
        name,
        classId,
        sessionId,
        date: targetDate,
        materi: materi || null,
      },
    });

    return res.status(201).json({
      message: "Pendaftaran berhasil",
      data: newReg,
    });
  },

  async listUpcomingSessions(req: Request, res: Response) {
    const { cursor, limit = 10, dateFilter, subjectFilter } = req.query;

    // today (start of local day)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // parse optional dateFilter (safe UTC parsing to avoid TZ shifts)
    let targetDate: Date | undefined = undefined;
    if (dateFilter && typeof dateFilter === "string") {
      const [y, m, d] = dateFilter.split("-").map(Number);
      targetDate = new Date(Date.UTC(y!, m! - 1, d));
      if (targetDate < today) {
        throw new BadRequestError(
          "Tidak boleh memilih tanggal yang sudah lewat"
        );
      }
    }

    // fetch registrations with related class and session (session includes subjects & tutors)
    // we fetch registrations (which are what we page by) and then filter by subjectFilter in-memory
    const regs = await prisma.registration.findMany({
      where: {
        date: {
          gte: today,
          ...(targetDate && { equals: targetDate }),
        },
      },
      orderBy: [{ date: "asc" }, { sessionId: "asc" }],
      take: Number(limit) + 1,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor as string },
      }),
      include: {
        class: true,
        session: {
          include: {
            subjects: { include: { subject: true } },
            tutors: { include: { tutor: true } },
          },
        },
      },
    });

    // If user supplied subjectFilter, keep only registrations whose session has that subject
    const filteredRegs =
      subjectFilter && typeof subjectFilter === "string"
        ? regs.filter((r) => {
            const sess = r.session;
            if (!sess || !Array.isArray(sess.subjects)) return false;

            return sess.subjects.some(
              (ss) =>
                ss.subject?.name &&
                ss.subject.name.toLowerCase() === subjectFilter.toLowerCase()
            );
          })
        : regs;

    // pagination: if we filtered out some items, we still use the original pagination approach:
    let nextCursor: string | null = null;
    let pageRegs = filteredRegs;
    if (filteredRegs.length > Number(limit)) {
      const next = filteredRegs.pop();
      nextCursor = next?.id ?? null;
      pageRegs = filteredRegs;
    }

    // GROUP BY date + session
    const grouped: Record<string, any> = {};
    for (const reg of pageRegs) {
      // safe guards
      if (!reg.session) continue;

      const dateKey = reg.date.toISOString().split("T")[0];
      if (!dateKey) continue;

      if (!grouped[dateKey]) grouped[dateKey] = {};

      const sess = reg.session;
      if (!grouped[dateKey][sess.id]) {
        grouped[dateKey][sess.id] = {
          sessionId: sess.id,
          date: reg.date,
          startTime: sess.startTime,
          endTime: sess.endTime,
          subjects: Array.isArray(sess.subjects)
            ? sess.subjects.map((s) => s.subject?.name).filter(Boolean)
            : [],
          tutors: Array.isArray(sess.tutors)
            ? sess.tutors.map((t) => t.tutor?.name).filter(Boolean)
            : [],
          tutorCount: Array.isArray(sess.tutors) ? sess.tutors.length : 0,
          participants: [],
        };
      }

      grouped[dateKey][sess.id].participants.push({
        id: reg.id,
        name: reg.name,
        class: reg.class?.name ?? null,
        materi: reg.materi ?? null,
      });
    }

    // FLATTEN → cocok untuk FE
    const result: any[] = [];
    for (const dateKey of Object.keys(grouped)) {
      for (const sid of Object.keys(grouped[dateKey])) {
        const s = grouped[dateKey][sid];
        const maxStudents = s.tutorCount * 10;

        result.push({
          sessionId: s.sessionId,
          date: s.date,
          time: `${s.startTime}–${s.endTime}`,
          subjects: s.subjects,
          tutors: s.tutors,
          participants: s.participants,
          total: s.participants.length,
          maxStudents,
        });
      }
    }

    return res.json({
      message: "Berhasil mengambil sesi",
      data: result,
      nextCursor,
    });
  },

  async availableSessions(req: Request, res: Response) {
    const { date, subjectId } = req.query;

    if (!date || typeof date !== "string") {
      throw new BadRequestError("Parameter 'date' wajib diisi");
    }

    // Parse tanggal tanpa timezone shift
    const [y, m, d] = date.split("-").map(Number);
    const targetDate = new Date(Date.UTC(y!, m! - 1, d));

    // --- 1. Query sesi di tanggal tersebut ---
    const sessions = await prisma.sessionInstance.findMany({
      where: { date: targetDate },
      include: {
        subjects: { include: { subject: true } },
        tutors: { include: { tutor: true } },
      },
      orderBy: { startTime: "asc" },
    });

    // --- 2. Filter by subject jika dikirim ---
    const filteredSessions = subjectId
      ? sessions.filter((s) =>
          s.subjects.some((sub) => sub.subjectId === subjectId)
        )
      : sessions;

    // --- 3. Hitung jumlah peserta per sesi ---
    const registrations = await prisma.registration.groupBy({
      by: ["sessionId"],
      where: { date: targetDate },
      _count: { sessionId: true },
    });

    const regMap = new Map<string, number>();
    registrations.forEach((r) => regMap.set(r.sessionId, r._count.sessionId));

    // --- 4. Format data untuk FE ---
    const result = filteredSessions.map((sess) => {
      const tutorCount = sess.tutors.length;
      const maxStudents = tutorCount * 10;

      const current = regMap.get(sess.id) ?? 0;

      return {
        sessionId: sess.id,
        time: `${sess.startTime}–${sess.endTime}`,
        subjects: sess.subjects.map((s) => s.subject.name),
        tutors: sess.tutors.map((t) => t.tutor.name),
        current,
        max: maxStudents,
      };
    });

    return res.json({
      message: "Berhasil mengambil sesi pada tanggal tersebut",
      data: result,
    });
  },
};
