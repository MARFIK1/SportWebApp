import { NextResponse } from "next/server";
import pool from "@/app/util/helpers/database";

export async function PATCH(req: Request, { params } : { params: { id: string } }) {
    try {
        const { id } = params;
        const { status, admin_comment } = await req.json();
        if (!["pending", "approved", "rejected"].includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        const result = await pool.query(
            "UPDATE articles SET status = $1, admin_comment = $2 WHERE id = $3 RETURNING id, status, admin_comment",
            [status, admin_comment, id]
        )

        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Article not found" }, { status: 404 });
        }

        return NextResponse.json({ article: result.rows[0] });
    }
    catch (error) {
        console.error("Error updating article status:", error);
        return NextResponse.json({ error: "Failed to update article status" }, { status: 500 });
    }
}