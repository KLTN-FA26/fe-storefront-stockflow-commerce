import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { SubmitQuoteChoice } from "../components/studio/submit-quote-choice";
import { quoteRequestFormSchema } from "../quote-request-schemas";
import type { QuoteRequestFormValues, QuoteRequestInput } from "../types";

function Harness({ unitsPerCarton }: { unitsPerCarton?: number }) {
  const form = useForm<QuoteRequestFormValues, unknown, QuoteRequestInput>({
    resolver: zodResolver(quoteRequestFormSchema),
    defaultValues: { cartons: "", desiredDeliveryDate: "" },
  });
  return (
    <SubmitQuoteChoice
      withQuote
      onWithQuoteChange={() => undefined}
      form={form}
      unitsPerCarton={unitsPerCarton}
    />
  );
}

describe("SubmitQuoteChoice — cartons wished for (UX audit S08-9)", () => {
  it("says how many pieces a carton holds and what the typed cartons come to", async () => {
    render(<Harness unitsPerCarton={1000} />);
    expect(screen.getByText("1 thùng = 1.000 cái")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Số thùng mong muốn/), "40");
    expect(screen.getByText(/40 thùng = 40.000 cái/)).toBeInTheDocument();
  });

  it("without the carton spec it adds nothing, as before", () => {
    render(<Harness />);
    expect(screen.queryByText(/1 thùng =/)).not.toBeInTheDocument();
  });
});
