import { Router, type IRouter } from "express";
import healthRouter from "./health";
import miaouRouter from "./miaou";
import calendarRouter from "./calendar";

const router: IRouter = Router();

router.use(healthRouter);
router.use(miaouRouter);
router.use(calendarRouter);

export default router;
