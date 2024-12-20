import { withRolePermission } from "@/app/lib/middleware";
import { NextResponse } from "next/server";
import prisma from "@/app/lib/db"; // Import Prisma client
import { getUserFromSession } from "@/app/lib/currentSesion"; // Get user from session
import { z } from "zod"; // Zod for validation

// Schema to validate the incoming request body
const updateThesisSchema = z.object({
  title: z.string().min(1).optional(), // Optional for update
  author_name: z.string().min(1).optional(), // Optional, but we'll use it to find the author
  category: z.string().optional(),
  keywords: z.array(z.string()).optional(), // Array of strings for keywords
  abstract: z.string().optional(),
  status: z.enum(["Pending", "Approved", "Rejected"]).optional(),
});

export const PUT = withRolePermission("MODIFY_THESIS")(async (req, { params }) => {
  const { id } = await params; // Get thesis id from params

  try {
    const body = await req.json();

    if (!body) {
      return NextResponse.json({ message: "Request body is empty or malformed" }, { status: 400 });
    }

    // Step 1: Validate the request body
    const parsedBody = updateThesisSchema.parse(body);

    // Step 2: Find the thesis by ID
    const thesis = await prisma.thesis.findUnique({
      where: { thesis_id: BigInt(id) },
    });

    if (!thesis) {
      return NextResponse.json({ message: "Thesis not found" }, { status: 404 });
    }

    // Step 3: Find the author by name if provided
    let author;
    if (parsedBody.author_name) {
      author = await prisma.user.findUnique({
        where: { username: parsedBody.author_name },
      });

      if (!author) {
        return NextResponse.json({ message: "Author not found" }, { status: 404 });
      }
    }

    // Step 4: Update the thesis fields if provided
    const updatedThesis = await prisma.thesis.update({
      where: { thesis_id: BigInt(id) },
      data: {
        title: parsedBody.title ?? thesis.title,
        category: parsedBody.category ?? thesis.category,
        keywords: parsedBody.keywords ?? thesis.keywords, // Store keywords as JSON
        abstract: parsedBody.abstract ?? thesis.abstract,
        status: parsedBody.status ?? thesis.status,
        author_id: author?.id ?? thesis.author_id, // Update author only if provided
      },
    });

    // Step 5: Prepare the response object
    const thesisResponse = {
      thesis_id: updatedThesis.thesis_id.toString(),
      title: updatedThesis.title,
      author_name: author ? author.username : thesis.author.username, // Get author name
      category: updatedThesis.category,
      keywords: updatedThesis.keywords, // Should return as a JSON array
      abstract: updatedThesis.abstract,
      status: updatedThesis.status,
      created_at: updatedThesis.created_at.toISOString(),
      updated_at: updatedThesis.updated_at.toISOString(),
    };

    const currentUser = await getUserFromSession(req);

    // Step 6: Log the action in the history (optional)
    await prisma.history.create({
      data: {
        user_id: currentUser.id,
        action: "Updated Thesis",
        description: `Thesis titled "${updatedThesis.title}" updated by ${currentUser.email}`,
      },
    });
    // Step 6: Return the updated thesis information
    return NextResponse.json({
      message: "Thesis updated successfully",
      thesis: thesisResponse,
    });
  } catch (error) {
    console.error("Error updating thesis:", error.message || error);

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Validation failed", errors: error.errors }, { status: 400 });
    }

    return NextResponse.json({ message: "Internal Server Error", error: error.message || error }, { status: 500 });
  }
});
