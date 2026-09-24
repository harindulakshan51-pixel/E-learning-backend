import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
    {
        orderId: {
            type: String,
            required: true,
            unique: true
        },
        
        email:{
            type: String,
            required: true
        },

        name:{
            type: String,
            required: true
        },

        address:{
            type: String,
            required: true
        },

        date:{
            type: Date,
            required: true,
            default: Date.now
        },

        total:{
            type: Number,
            required: true
        },
        
        status:{
            type: String,
            required: true,
            default: "Pending"
        },

        phone:{
            type: String,
            required: false
        },

        notes:{
            type: String,
            required: false
        },

        items:[
            {
                courseId:{
                    type: String,
                    required: true
                },
                title:{
                    type: String,
                    required: true
                },
                price:{
                    type: Number,
                    required: true
                },
                quantity:{
                    type: Number,
                    required: true
                },
                thumbnail:{
                    type: String,
                    required: true
                }
            }
        ]
    }
)

const order = mongoose.model("order", orderSchema)

export default order;