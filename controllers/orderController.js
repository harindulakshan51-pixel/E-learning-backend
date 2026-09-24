import order from "../models/order.js";
import Course from "../models/course.js";
import Enrollment from "../models/enrollment.js"; // ← NEW


//CREATE ORDER
export async function createOrder(req, res){ 

    if(req.user == null){
        res.status(401).json({
            message: "Unauthorized"
        });
        return;
    }

    try{
        const latestOrder = await order.findOne().sort({date : -1})

        let orderId = "ORD000001"

        if(latestOrder != null){
            let latestOrderId = latestOrder.orderId;
            let latestOrderNumberString = latestOrderId.replace("ORD",""); 
            let latestOrderNumber = parseInt(latestOrderNumberString)

            let newOrderNumber = latestOrderNumber + 1;
            let newOrderNumberString = newOrderNumber.toString().padStart(6, "0");
            
            orderId = "ORD" + newOrderNumberString;
        }

        const items = []
        let total = 0

        for(let i = 0; i < req.body.items.length; i++){

            const courseData = await Course.findOne({courseId : req.body.items[i].courseId}) 
            if(courseData == null){
                return res.status(500).json({
                    message: "Error placing order - Course not found",
                })
            }

            items.push({
                courseId: courseData.courseId,
                title: courseData.title,
                price: courseData.price,
                thumbnail: courseData.thumbnail,
                quantity: req.body.items[i].quantity, 
            })

            total += courseData.price * req.body.items[i].quantity 
        }
            
        let name = req.body.name
        if(name == null){
            name = req.user.firstName + " " + req.user.lastName
        }

        const newOrder = new order({
            orderId : orderId,
            email: req.user.email,
            name: name,
            address: req.body.address,
            total: total,
            items: items,
            phone : req.body.phone,
        })

        await newOrder.save()

        return res.status(200).json({
            message: "Order placed successfully",
            orderId: orderId
        });

    } catch(error){
        return res.status(500).json({
            message: "Error placing order",
            error: error.message
        }); 
    }
}



//GET ORDER
export async function getOrders(req, res){
    if(req.user == null){
        res.status(401).json({
            message: "Unauthorized"
        });
        return;
    }

    try {
        let orders;

        if(req.user.isAdmin){
            orders = await order.find().sort({date : -1});
        } else {
            orders = await order.find({email: req.user.email}).sort({date : -1});
        }

        return res.status(200).json(orders);
    } catch(error){
        return res.status(500).json({
            message: "Error fetching orders",
            error: error.message
        });
    }
}



//UPDATE ORDER STATUS
export async function updateOrderStatus(req, res) {

  if (req.user == null || !req.user.isAdmin) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  try {
    const orderId = req.params.orderId;
    const status = req.body.status;
    const notes = req.body.notes;

    await order.updateOne(
      { orderId: orderId },
      { 
        status: status, 
        notes: notes 
      } 
    );

    // ── Order "Completed" වෙද්දී Enrollments Create කරනවා ──
    if (status === "Completed") {
      const completedOrder = await order.findOne({ orderId: orderId });

      for (const item of completedOrder.items) {
        const alreadyEnrolled = await Enrollment.findOne({
          userId: completedOrder.email,
          courseId: item.courseId,
        });

        if (!alreadyEnrolled) {
          await Enrollment.create({
            userId: completedOrder.email,
            courseId: item.courseId,
          });
        }
      }
    }
    // ── End Enrollment Block ──

    res.status(200).json({
      message: "Order status updated successfully",
    });

  } catch (error) {
    res.status(500).json({
      message: "Error updating order status",
      error: error.message,
    });
  }
}


//GET MY LEARNING
export async function getMyLearning(req, res) {
    if (req.user == null) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    try {
        const completedOrders = await order.find({
            email: req.user.email,
            status: "Completed"
        });

        const seenIds = new Set();
        const courses = [];

        completedOrders.forEach((o) => {
            o.items.forEach((item) => {
                if (!seenIds.has(item.courseId)) {
                    seenIds.add(item.courseId);
                    courses.push({
                        courseId: item.courseId,
                        title: item.title,
                        price: item.price,
                        image: item.thumbnail, 
                    });
                }
            });
        });

        return res.status(200).json(courses);

    } catch (error) {
        return res.status(500).json({
            message: "Error fetching learning courses",
            error: error.message
        });
    }
}