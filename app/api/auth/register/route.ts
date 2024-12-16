import { NextResponse } from "next/server";
import { generateToken } from "@/app/util/helpers/jwt";
import { sendEmail } from "@/app/util/helpers/email";
import pool from "@/app/util/helpers/database";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { nickname, email, password, first_name, last_name } = body;
        if (!nickname || !email || !password) {
            return NextResponse.json({ error: "Nickname, email, and password are required!" }, { status: 400 });
        }

        const existingUser = await pool.query(
            "SELECT * FROM users WHERE email = $1 OR nickname = $2",
            [email, nickname]
        )
        if (existingUser.rows.length > 0) {
            return NextResponse.json({ error: "A user with this email or nickname already exists." }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            `INSERT INTO users (nickname, email, password, first_name, last_name) VALUES ($1, $2, $3, $4, $5) RETURNING id, nickname, email`,
            [nickname, email, hashedPassword, first_name, last_name]
        )

        const verificationToken = generateToken({ id: newUser.rows[0].id }, "1h");
        const verificationUrl = `http://localhost:3000/verify?token=${verificationToken}`;
        await sendEmail(
            email,
            "Account Verification",
            `
            <h1>Welcome ${nickname}!</h1>
            <p>Thank you for registering. Click the link below to verify your email address:</p>
            <a href="${verificationUrl}">Verify your email</a>
            `
        )

        return NextResponse.json({
            message: "User registered! Verification email has been sent.",
            user: newUser.rows[0]
        }, { status: 201 });
    }
    catch (error: unknown) {
        if (error instanceof Error) {
            console.error("Error during registration:", error.message);
            return NextResponse.json({ error: "An error occurred during registration.", details: error.message }, { status: 500 });
        }
        else {
            console.error("Unknown error during registration:", error);
            return NextResponse.json({ error: "Unknown error during registration." }, { status: 500 });
        }
    }
}