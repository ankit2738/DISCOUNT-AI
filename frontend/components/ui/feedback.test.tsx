import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

describe("Alert", () => {
  it("renders accessible alert content", () => {
    render(
      <Alert variant="success">
        <AlertTitle>Price alert saved</AlertTitle>
        <AlertDescription>We will check it against new snapshots.</AlertDescription>
      </Alert>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Price alert saved");
    expect(screen.getByRole("alert")).toHaveTextContent("new snapshots");
  });

  it("supports the destructive alias", () => {
    render(<Alert variant="destructive">Unable to save</Alert>);
    expect(screen.getByRole("alert")).toHaveClass("bg-red-50");
  });
});

describe("Badge", () => {
  it("renders variant styling and custom classes", () => {
    render(<Badge variant="warning" className="custom-badge">Demo data</Badge>);
    const badge = screen.getByText("Demo data");
    expect(badge).toHaveClass("bg-amber-100");
    expect(badge).toHaveClass("custom-badge");
  });
});
