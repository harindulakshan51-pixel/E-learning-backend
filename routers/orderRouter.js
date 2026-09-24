import express from "express";
import { createOrder, getOrders, updateOrderStatus, getMyLearning  } from "../controllers/orderController.js";

const orderRouter = express.Router();

orderRouter.get("/mylearning", getMyLearning);
orderRouter.post("/", createOrder);
orderRouter.get("/", getOrders); 
orderRouter.put("/:orderId",updateOrderStatus);

export default orderRouter;