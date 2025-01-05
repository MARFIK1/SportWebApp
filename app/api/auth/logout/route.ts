import { NextResponse } from "next/server";

export async function POST() {
    return NextResponse.json(
        { message: "Logged out successfully" },
        {
            headers: {
                "Set-Cookie": `user=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
            }
        }
    )
}