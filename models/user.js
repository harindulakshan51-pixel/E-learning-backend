import mongoose from "mongoose";

const userSchema = new mongoose.Schema(

    {
        sessionVersion: { type: Number, default: 0 },
        email : {
            type : String,
            unique : true,
            required : true 
        },        

        firstName : {
            type : String,
            required : true
        },

        lastName : {
            type : String,
            required : true
        },

        password : {
            type : String,
            required : true
        },

        isAdmin : {
            type : Boolean,
            required : true,
            default : false
        },

        isBlocked : {
            type : Boolean,
            required : true,
            default : false
        },

        image : {
            type : String,
            required : true,
            default : "/defaultProfileIcon.png"
        }
    }

)

const User = mongoose.model("user" , userSchema)

export default User
