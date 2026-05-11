"use client";

import { UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { InterviewCardFrame } from "@/components/interviews/participant-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { browserApiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { InterviewInvitePayload } from "@/lib/interviews/types";

type ParticipantDetailsFormProps = {
  initialValues: Record<string, boolean | string>;
  invite: InterviewInvitePayload;
};

function isFieldComplete(
  value: boolean | string | undefined,
  required: boolean | undefined,
) {
  if (!required) {
    return true;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return value !== undefined && value !== "";
}

export function ParticipantDetailsForm({
  initialValues,
  invite,
}: ParticipantDetailsFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, boolean | string>>(
    initialValues,
  );
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const missingFields = invite.participantFields
    .filter((field) => !isFieldComplete(values[field.id], field.required))
    .map((field) => field.label);

  return (
    <div className="w-full max-w-2xl">
      <InterviewCardFrame>
        <form
          className="space-y-6 px-8 py-9 sm:px-10"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);

            if (missingFields.length > 0) {
              setError(`Please complete: ${missingFields.join(", ")}.`);
              return;
            }

            if (!consentAccepted) {
              setError("Please confirm consent before continuing.");
              return;
            }

            startTransition(async () => {
              try {
                await browserApiClient.publicInterviews.act(invite.inviteCode, {
                  action: "submit-details",
                  consentAccepted: true,
                  participantResponses: values,
                });
              } catch {
                setError("We could not save your details. Please try again.");
                return;
              }

              router.push(`/interviews/${invite.inviteCode}/preparing`);
            });
          }}
        >
          <div className="space-y-2 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/8 text-primary">
              <UserRound className="size-6" />
            </div>
            <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight text-zinc-950">
              Tell us a little about you
            </h1>
            <p className="mx-auto max-w-[320px] text-[14px] leading-6 text-zinc-500">
              We use this context to tailor the interview and make follow-up questions more relevant.
            </p>
          </div>

          <div className="space-y-4">
            {invite.participantFields.map((field) => {
              const value = values[field.id];
              const helperText = field.helperText ? (
                <p className="text-[12px] text-zinc-500">{field.helperText}</p>
              ) : null;

              if (field.type === "radio") {
                return (
                  <fieldset key={field.id} className="flex flex-col gap-1.5">
                    <legend className="block text-[13px] font-semibold text-zinc-900">
                      {field.label}
                    </legend>
                    <div className="flex max-w-[420px] gap-2.5">
                      {field.options?.map((option) => {
                        const checked = value === option.value;

                        return (
                          <label
                            key={option.value}
                            className={cn(
                              "min-w-0 flex-1 cursor-pointer rounded-xl border px-4 py-3 text-center text-sm font-medium transition-colors",
                              checked
                                ? "border-primary bg-primary/6 text-primary"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            <input
                              type="radio"
                              name={field.id}
                              value={option.value}
                              checked={checked}
                              onChange={(event) =>
                                setValues((current) => ({
                                  ...current,
                                  [field.id]: event.target.value,
                                }))
                              }
                              className="sr-only"
                            />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {helperText}
                  </fieldset>
                );
              }

              return (
                <div key={field.id} className="flex flex-col gap-1.5">
                  {field.type !== "checkbox" ? (
                    <label
                      htmlFor={field.id}
                      className="block text-[13px] font-semibold text-zinc-900"
                    >
                      {field.label}
                    </label>
                  ) : null}

                  {field.type === "text" ? (
                    <Input
                      className="rounded-md"
                      id={field.id}
                      value={typeof value === "string" ? value : ""}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.id]: event.target.value,
                        }))
                      }
                    />
                  ) : null}

                  {field.type === "select" ? (
                    <Select
                      value={typeof value === "string" ? value : ""}
                      onValueChange={(nextValue) =>
                        setValues((current) => ({
                          ...current,
                          [field.id]: String(nextValue),
                        }))
                      }
                    >
                      <SelectTrigger id={field.id} className="rounded-md">
                        <SelectValue>
                          {field.options?.find((option) => option.value === value)?.label ??
                            field.placeholder}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}

                  {field.type === "checkbox" ? (
                    <label className="flex items-start gap-3 rounded-[18px] border border-zinc-200/80 bg-zinc-50/70 px-4 py-3">
                      <Checkbox
                        checked={Boolean(value)}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.id]: event.target.checked,
                          }))
                        }
                      />
                      <span className="space-y-0.5">
                        <span className="block text-[14px] font-medium text-zinc-900">
                          {field.label}
                        </span>
                        {field.helperText ? (
                          <span className="block text-[13px] text-zinc-500">
                            {field.helperText}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ) : null}

                  {field.type !== "checkbox" ? helperText : null}
                </div>
              );
            })}
          </div>

          <label className="flex items-start gap-2.5">
            <Checkbox
              className="mt-1 shrink-0"
              checked={consentAccepted}
              onChange={(event) => setConsentAccepted(event.target.checked)}
            />
            <span className="flex-1 text-[13px] leading-6 text-zinc-500">
              {invite.consentCopy}
            </span>
          </label>

          {error ? (
            <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] text-rose-600">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            disabled={isPending}
            className="h-12 w-full rounded-xl text-sm font-semibold shadow-[0_24px_48px_-24px_rgba(29,78,216,0.5)]"
          >
            {isPending ? "Saving..." : "Continue"}
          </Button>
        </form>
      </InterviewCardFrame>
    </div>
  );
}
