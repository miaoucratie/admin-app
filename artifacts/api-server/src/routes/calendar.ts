import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { getEventsForDay, todayInParis } from "../lib/calendar";

const UPSTREAM_BASE =
  "https://miaoucratie-reservation-api.miaoucratie.workers.dev";
const ALLOWED_ORIGIN = "https://miaoucratie.fr";

const router: IRouter = Router();

/**
 * The calendar exposes private events, so we gate it behind the same admin
 * token the app already uses. We validate the bearer token by calling the
 * upstream reservation API; a 200 means the token is valid.
 */
async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.header("authorization");
  if (!auth) {
    res.status(401).json({ message: "Authentification requise." });
    return;
  }
  try {
    const check = await fetch(`${UPSTREAM_BASE}/admin/unavailabilities`, {
      headers: {
        Accept: "application/json",
        Origin: ALLOWED_ORIGIN,
        Referer: `${ALLOWED_ORIGIN}/`,
        Authorization: auth,
      },
    });
    if (check.status === 401 || check.status === 403) {
      res.status(401).json({ message: "Session expirée." });
      return;
    }
    if (!check.ok) {
      res
        .status(502)
        .json({ message: "Vérification de session impossible. Réessayez." });
      return;
    }
    next();
  } catch (err) {
    req.log.error({ err }, "Calendar auth check failed");
    res.status(502).json({ message: "Service injoignable. Réessayez." });
  }
}

router.get(
  "/miaou/calendar",
  requireAdmin,
  async (req: Request, res: Response) => {
    const icalUrl = process.env.MIAOU_CALENDAR_ICAL_URL;
    if (!icalUrl) {
      req.log.error("MIAOU_CALENDAR_ICAL_URL is not configured");
      res.status(500).json({ message: "Agenda non configuré." });
      return;
    }

    const rawDate = req.query.date;
    const date =
      typeof rawDate === "string" && rawDate ? rawDate : todayInParis();

    try {
      const events = await getEventsForDay(icalUrl, date);
      res.json({ date, events });
    } catch (err) {
      if (err instanceof Error && err.message === "INVALID_DATE") {
        res
          .status(400)
          .json({ message: "Date invalide (format attendu : AAAA-MM-JJ)." });
        return;
      }
      req.log.error({ err }, "Failed to load calendar events");
      res.status(502).json({ message: "Agenda injoignable. Réessayez." });
    }
  },
);

export default router;
