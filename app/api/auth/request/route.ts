import { NextResponse } from "next/server";
import { generateToken } from "@/app/util/helpers/jwt";
import { sendEmail } from "@/app/util/helpers/email";
import pool from "@/app/util/helpers/database";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email } = body;
        if (!email) {
            return NextResponse.json({ error: "Email is required!" }, { status: 400 });
        }

        const userQuery = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        const user = userQuery.rows[0];
        if (!user) {
            return NextResponse.json({ error: "User with the provided email does not exist." }, { status: 404 });
        }

        const resetToken = generateToken({ id: user.id }, "15m");
        const resetUrl = `http://localhost:3000/reset-password?token=${resetToken}`;
        await sendEmail(
            email,
            "Password Reset",
            `
            <h1>Password Reset</h1>
            <p>Click the link below to reset your password:</p>
            <a href="${resetUrl}">Reset Password</a>
            <p>The link is valid for 15 minutes.</p>
            `
        )

        return NextResponse.json({ message: "Password reset email has been sent." });
    }
    catch (error: unknown) {
        if (error instanceof Error) {
            console.error("Error during password reset request:", error.message);
            return NextResponse.json({ error: "An error occurred during password reset.", details: error.message }, { status: 500 });
        }
        else {
            console.error("Unknown error during password reset request:", error);
            return NextResponse.json({ error: "Unexpected error during password reset." }, { status: 500 });
        }
    }
}