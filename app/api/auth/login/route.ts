import { NextResponse } from "next/server";
import { generateToken } from "@/app/util/helpers/jwt";
import pool from "@/app/util/helpers/database";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, password } = body;
        if (!email || !password) {
            return NextResponse.json({ error: "Email and password are required!" }, { status: 400 });
        }

        const userQuery = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        const user = userQuery.rows[0];
        if (!user) {
            return NextResponse.json({ error: "User with the provided email not found." }, { status: 404 });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return NextResponse.json({ error: "Invalid password." }, { status: 401 });
        }

        const token = generateToken({ id: user.id, email: user.email, nickname: user.nickname });

        return NextResponse.json({
            message: "Login successful!",
            user: {
                id: user.id,
                nickname: user.nickname,
                email: user.email
            },
            token: token
        });
    }
    catch (error) {
        console.error("Error during login:", error);
        return NextResponse.json({ error: "An error occurred during login.", details: error }, { status: 500 });
    }
}