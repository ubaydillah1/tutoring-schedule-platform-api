// controllers/admin.controller.ts
import { type Request, type Response } from "express";
import prisma from "../config/prisma.js";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../utils/errors.js";
import {
  WEEKDAY_SESSIONS,
  SATURDAY_SESSIONS,
  parseDateToUTCStart,
} from "../constants/sessionTemplate.js";

export const AdminController = {
  // CREATE SUBJECT
  async createSubject(req: Request, res: Response) {
    const { name, description } = req.body;

    if (!name) {
      throw new BadRequestError("name is required");
    }

    const exists = await prisma.subject.findUnique({
      where: { name },
    });

    if (exists) {
      throw new ConflictError("Subject already exists");
    }

    const subject = await prisma.subject.create({
      data: {
        name,
        description: description || null,
      },
    });

    return res.status(201).json({
      message: "Subject created",
      data: subject,
    });
  },

  // LIST SUBJECTS
  async listSubjects(_req: Request, res: Response) {
    const subjects = await prisma.subject.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });

    return res.json({
      message: "Subjects listed",
      data: subjects,
    });
  },

  // DELETE SUBJECT
  async deleteSubject(req: Request, res: Response) {
    const { id } = req.params;

    if (!id) {
      throw new BadRequestError("id is required");
    }

    const exists = await prisma.subject.findUnique({
      where: { id },
    });

    if (!exists) {
      throw new NotFoundError("Subject not found");
    }

    await prisma.subject.delete({
      where: { id },
    });

    return res.json({
      message: "Subject deleted",
    });
  },

  async createClass(req: Request, res: Response) {
    const { name } = req.body;

    if (!name) {
      throw new BadRequestError("name is required");
    }

    const exists = await prisma.class.findUnique({
      where: { name },
    });

    if (exists) {
      throw new ConflictError("Class already exists");
    }

    const classItem = await prisma.class.create({
      data: { name },
    });

    return res.status(201).json({
      message: "Class created",
      data: classItem,
    });
  },

  // ==========================
  // LIST CLASSES
  // ==========================
  async listClasses(_req: Request, res: Response) {
    const classes = await prisma.class.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    });

    return res.json({
      message: "Classes fetched",
      data: classes,
    });
  },

  // ==========================
  // DELETE CLASS
  // ==========================
  async deleteClass(req: Request, res: Response) {
    const { id } = req.params;

    if (!id) {
      throw new BadRequestError("id is required");
    }

    const exists = await prisma.class.findUnique({
      where: { id },
    });

    if (!exists) {
      throw new NotFoundError("Class not found");
    }

    // prevent deletion if class is used by registrations
    const used = await prisma.registration.count({
      where: { classId: id },
    });

    if (used > 0) {
      throw new ConflictError("Cannot delete: class is used by registrations");
    }

    await prisma.class.delete({
      where: { id },
    });

    return res.json({
      message: "Class deleted",
    });
  },

  async getSessionsByDate(req: Request, res: Response) {
    try {
      const date = req.query.date as string;
      if (!date)
        return res.status(400).json({ message: "date is required", data: [] });

      const targetDate = parseDateToUTCStart(date);
      const day = targetDate.getUTCDay();
      if (day === 0)
        return res.json({ message: "No sessions on Sunday", data: [] });

      const template = day === 6 ? SATURDAY_SESSIONS : WEEKDAY_SESSIONS;

      // load all SessionInstances for this date (if any)
      const instances = await prisma.sessionInstance.findMany({
        where: { date: targetDate },
        include: {
          // we don't need include mappings here; we'll load mappings separately
        },
      });

      // load mapping rows (tutor/subject) for this date
      const tutorMap = await prisma.tutorSession.findMany({
        where: { date: targetDate },
        include: { tutor: true },
      });

      const subjectMap = await prisma.sessionSubject.findMany({
        where: { date: targetDate },
        include: { subject: true },
      });

      // build response: for each template slot, if there's an instance (matching slot name), attach it
      const result = template.map((tpl) => {
        const inst = instances.find((i) => i.slotName === tpl.name);

        // determine sessionId to lookup mapping: if instance exists -> inst.id else use null
        const sessionKey = inst ? inst.id : null;

        const tutors = sessionKey
          ? tutorMap
              .filter((t) => t.sessionId === sessionKey)
              .map((t) => ({ id: t.tutorId, name: t.tutor.name }))
          : [];

        const subjects = sessionKey
          ? subjectMap
              .filter((s) => s.sessionId === sessionKey)
              .map((s) => ({ id: s.subjectId, name: s.subject.name }))
          : [];

        return {
          slotId: tpl.id, // template slot id (used by FE to identify which slot)
          slotName: tpl.name,
          startTime: tpl.startTime,
          endTime: tpl.endTime,
          id: inst ? inst.id : null, // instance id or null if never customized
          tutors,
          subjects,
        };
      });

      return res.json({ message: "Sessions fetched", data: result });
    } catch (err) {
      console.error("getSessionsByDate error:", err);
      return res
        .status(500)
        .json({ message: "Server error", error: (err as any).message });
    }
  },
  
  async updateSession(req: Request, res: Response) {
    try {
      const { slotId } = req.params;
      console.log(slotId);
      const {
        date,
        id: instanceIdFromBody = null,
        tutorIds = [],
        subjectIds = [],
      } = req.body;

      if (!slotId)
        return res.status(400).json({ message: "slotId is required" });
      if (!date) return res.status(400).json({ message: "date is required" });

      const targetDate = parseDateToUTCStart(date);
      const day = targetDate.getUTCDay();
      if (day === 0)
        return res
          .status(400)
          .json({ message: "Cannot update sessions on Sunday" });

      // find template slot metadata
      const template = day === 6 ? SATURDAY_SESSIONS : WEEKDAY_SESSIONS;
      const slot = template.find((t) => t.id === slotId);
      if (!slot)
        return res
          .status(400)
          .json({ message: "Invalid slotId for this date" });

      // find existing instance for this slot+date (if any)
      let instance = null;
      if (instanceIdFromBody) {
        instance = await prisma.sessionInstance.findUnique({
          where: { id: instanceIdFromBody },
        });
      } else {
        // maybe previously created instance exists for this slot+date (by slotName)
        instance = await prisma.sessionInstance.findFirst({
          where: { date: targetDate, slotName: slot.name },
        });
      }

      // if no instance exists and tutorIds/subjectIds not empty -> create new instance
      if (!instance && (tutorIds.length > 0 || subjectIds.length > 0)) {
        instance = await prisma.sessionInstance.create({
          data: {
            date: targetDate,
            slotName: slot.name,
            startTime: slot.startTime,
            endTime: slot.endTime,
          },
        });
      }

      // if instance exists -> replace mappings; if no instance and empty arrays => nothing to do (reset state)
      if (instance) {
        // delete previous mappings for this instance id & date
        await prisma.tutorSession.deleteMany({
          where: { sessionId: instance.id, date: targetDate },
        });

        await prisma.sessionSubject.deleteMany({
          where: { sessionId: instance.id, date: targetDate },
        });

        // create new mappings if provided
        if (tutorIds && tutorIds.length > 0) {
          await prisma.tutorSession.createMany({
            data: tutorIds.map((tutorId: string) => ({
              sessionId: instance.id,
              tutorId,
              date: targetDate,
            })),
          });
        }

        if (subjectIds && subjectIds.length > 0) {
          await prisma.sessionSubject.createMany({
            data: subjectIds.map((subjectId: string) => ({
              sessionId: instance.id,
              subjectId,
              date: targetDate,
            })),
          });
        }

        // optionally: if after update there are no mappings, you might want to delete instance to revert to 'never customized' behavior
        const remainingTutors = await prisma.tutorSession.count({
          where: { sessionId: instance.id, date: targetDate },
        });

        const remainingSubjects = await prisma.sessionSubject.count({
          where: { sessionId: instance.id, date: targetDate },
        });

        if (remainingTutors === 0 && remainingSubjects === 0) {
          // nothing remains — remove the instance record so FE will see id=null next time
          await prisma.sessionInstance.delete({ where: { id: instance.id } });
          return res.json({
            message: "Session reset to default (no custom data)",
          });
        }

        return res.json({
          message: "Session instance updated",
          instanceId: instance.id,
        });
      }

      // If we reach here: no instance was created (empty payload) -> ok
      return res.json({ message: "No changes (nothing to create/update)" });
    } catch (err) {
      console.error("updateSession error:", err);
      return res
        .status(500)
        .json({ message: "Server error", error: (err as any).message });
    }
  },
  async createTutor(req: Request, res: Response) {
    const { name, phoneNumber } = req.body;

    if (!name) {
      throw new BadRequestError("name is required");
    }

    // optional: prevent duplicate
    const exists = await prisma.tutor.findFirst({
      where: { name },
    });

    if (exists) {
      throw new ConflictError("Tutor already exists");
    }

    const tutor = await prisma.tutor.create({
      data: {
        name,
        phoneNumber: phoneNumber || null,
      },
    });

    return res.status(201).json({
      message: "Tutor created",
      data: tutor,
    });
  },

  async listTutors(_req: Request, res: Response) {
    const tutors = await prisma.tutor.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
      },
    });

    return res.json({
      message: "Tutors fetched",
      data: tutors,
    });
  },

  async deleteTutor(req: Request, res: Response) {
    const { id } = req.params;

    if (!id) {
      throw new BadRequestError("id is required");
    }

    const tutor = await prisma.tutor.findUnique({
      where: { id },
    });

    if (!tutor) {
      throw new NotFoundError("Tutor not found");
    }

    // prevent delete if used in sessions
    const used = await prisma.tutorSession.count({
      where: { tutorId: id },
    });

    if (used > 0) {
      throw new ConflictError(
        "Cannot delete tutor: already assigned to a session"
      );
    }

    await prisma.tutor.delete({
      where: { id },
    });

    return res.json({
      message: "Tutor deleted",
    });
  },
};
