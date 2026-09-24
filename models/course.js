import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(

    {
        courseId : {
            type : String,
            unique : true,
            required : true
        },

        title : {
            type : String,
            required : true
        },

        description : {
            type : String,
            required : true
        },

        price : {
            type : Number,
            required : true
        },

        labelledPrice : {
            type : String,
            required : true
        },

        thumbnail : {
            type : String,
            required : true,
            default : "/default-course.png"
        },

        instructor : {
            type : String,
            required : true
        },

        duration : {
            type : String,
            required : true
        },

        category : {
            type : String,
            required : false
        },

        isAvailable : {
            type : Boolean,
            required : true,
            default : true
        }
        
    }

)

const Course = mongoose.model("course" , courseSchema)

export default Course