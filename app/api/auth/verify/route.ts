import { NextResponse } from "next/server";

import { verifyToken } from "../../../util/helpers/jwt";
import pool from "../../../util/helpers/database";

export async function POST(req: Request) {
    try {
        const { token } = await req.json();
        if (!token) {
            return NextResponse.json({ error: "Token is required!" }, { status: 400 });
        }

        const decoded = verifyToken(token);
        if (!decoded || !decoded.id) {
            return NextResponse.json({ error: "Invalid token." }, { status: 400 });
        }

        const result = await pool.query(
            "UPDATE users SET email_verified = TRUE WHERE id = $1 RETURNING email_verified",
            [decoded.id]
        )
        if (result.rowCount === 0) {
            return NextResponse.json({ error: "User not found." }, { status: 404 });
        }

        return NextResponse.json({ message: "Email has been successfully verified!" });
    }
    catch (error) {
        console.error("Error during email verification:", error);
        return NextResponse.json({ error: "An error occurred during verification." }, { status: 500 });
    }
}