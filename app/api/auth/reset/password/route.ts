import { NextResponse } from "next/server";
import { verifyToken } from "@/app/util/helpers/jwt";
import pool from "@/app/util/helpers/database";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { token, newPassword } = body;
        if (!token || !newPassword) {
            return NextResponse.json({ error: "Token and new password are required!" }, { status: 400 });
        }

        let decoded;
        try {
            decoded = verifyToken(token);
        }
        catch (error) {
            return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query(
            "UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2",
            [hashedPassword, decoded.id]
        )

        return NextResponse.json({ message: "Password has been successfully updated!" });
    }
    catch (error: unknown) {
        if (error instanceof Error) {
            console.error("Error during password reset:", error.message);
            return NextResponse.json({ error: "An error occurred during password update.", details: error.message }, { status: 500 });
        }
        else {
            console.error("Unknown error during password reset:", error);
            return NextResponse.json({ error: "Unexpected error during password update." }, { status: 500 });
        }
    }
}