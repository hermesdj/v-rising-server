import Router from "express-promise-router";
import {ensureAuthenticated} from "./utils.js";

const router = Router();

router.get('/:id', ensureAuthenticated, async (req, res) => {

});

export default router;
