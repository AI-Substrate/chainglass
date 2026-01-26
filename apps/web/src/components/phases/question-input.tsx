'use client';

/**
 * QuestionInput - Human input component for blocked phases
 *
 * Renders appropriate input controls based on question type:
 * - single_choice: Radio buttons
 * - multi_choice: Checkboxes
 * - free_text: Textarea
 * - confirm: Yes/No buttons
 *
 * Accessibility: Never disables submit button, uses proper ARIA labels,
 * minimum 44×44px touch targets for mobile.
 *
 * @see Plan 011: UI Mockups (AC-14 through AC-19)
 */

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

import type { PhaseQuestion, QuestionType } from '@/data/fixtures/workflows.fixture';

export interface QuestionInputProps {
  /** Question data */
  question: PhaseQuestion;
  /** Callback when answer is submitted */
  onSubmit: (questionId: string, answer: string | string[] | boolean) => void;
  /** Whether submission is in progress */
  isSubmitting?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * QuestionInput renders the appropriate input for a phase question.
 *
 * @example
 * <QuestionInput
 *   question={phase.question}
 *   onSubmit={(id, answer) => handleAnswer(id, answer)}
 * />
 */
export function QuestionInput({
  question,
  onSubmit,
  isSubmitting = false,
  className,
}: QuestionInputProps) {
  const [value, setValue] = useState<string | string[] | boolean>(
    question.defaultValue ?? getDefaultValue(question.type)
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    // Validate required
    if (question.required) {
      if (question.type === 'free_text' && typeof value === 'string' && !value.trim()) {
        setError('This field is required');
        return;
      }
      if (question.type === 'multi_choice' && Array.isArray(value) && value.length === 0) {
        setError('Please select at least one option');
        return;
      }
    }

    setError(null);
    onSubmit(question.id, value);
  };

  return (
    <Card className={`border-orange-200 dark:border-orange-800 ${className ?? ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <CardTitle className="text-base">Input Required</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm font-medium">{question.prompt}</p>

        {question.type === 'single_choice' && (
          <SingleChoiceInput
            choices={question.choices ?? []}
            value={value as string}
            onChange={(v) => {
              setValue(v);
              setError(null);
            }}
          />
        )}

        {question.type === 'multi_choice' && (
          <MultiChoiceInput
            choices={question.choices ?? []}
            value={value as string[]}
            onChange={(v) => {
              setValue(v);
              setError(null);
            }}
          />
        )}

        {question.type === 'free_text' && (
          <FreeTextInput
            value={value as string}
            onChange={(v) => {
              setValue(v);
              setError(null);
            }}
          />
        )}

        {question.type === 'confirm' && (
          <ConfirmInput
            value={value as boolean}
            onChange={(v) => {
              setValue(v);
              setError(null);
            }}
          />
        )}

        {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
      </CardContent>

      <CardFooter>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full min-h-[44px]"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Answer'}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ============ Input Components ============

function getDefaultValue(type: QuestionType): string | string[] | boolean {
  switch (type) {
    case 'single_choice':
      return '';
    case 'multi_choice':
      return [];
    case 'free_text':
      return '';
    case 'confirm':
      return false;
  }
}

interface SingleChoiceInputProps {
  choices: string[];
  value: string;
  onChange: (value: string) => void;
}

function SingleChoiceInput({ choices, value, onChange }: SingleChoiceInputProps) {
  return (
    <RadioGroup value={value} onValueChange={onChange} className="space-y-2">
      {choices.map((choice) => (
        <div key={choice} className="flex items-center space-x-3">
          <RadioGroupItem
            value={choice}
            id={`radio-${choice}`}
            className="min-w-[20px] min-h-[20px]"
          />
          <Label
            htmlFor={`radio-${choice}`}
            className="text-sm cursor-pointer min-h-[44px] flex items-center"
          >
            {choice}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

interface MultiChoiceInputProps {
  choices: string[];
  value: string[];
  onChange: (value: string[]) => void;
}

function MultiChoiceInput({ choices, value, onChange }: MultiChoiceInputProps) {
  const handleCheck = (choice: string, checked: boolean) => {
    if (checked) {
      onChange([...value, choice]);
    } else {
      onChange(value.filter((v) => v !== choice));
    }
  };

  return (
    <div className="space-y-2">
      {choices.map((choice) => (
        <div key={choice} className="flex items-center space-x-3">
          <Checkbox
            id={`checkbox-${choice}`}
            checked={value.includes(choice)}
            onCheckedChange={(checked) => handleCheck(choice, checked === true)}
            className="min-w-[20px] min-h-[20px]"
          />
          <Label
            htmlFor={`checkbox-${choice}`}
            className="text-sm cursor-pointer min-h-[44px] flex items-center"
          >
            {choice}
          </Label>
        </div>
      ))}
    </div>
  );
}

interface FreeTextInputProps {
  value: string;
  onChange: (value: string) => void;
}

function FreeTextInput({ value, onChange }: FreeTextInputProps) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter your response..."
      className="min-h-[100px]"
      aria-label="Free text response"
    />
  );
}

interface ConfirmInputProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

function ConfirmInput({ value, onChange }: ConfirmInputProps) {
  return (
    <div className="flex gap-3">
      <Button
        variant={value === true ? 'default' : 'outline'}
        onClick={() => onChange(true)}
        className="flex-1 min-h-[44px]"
        aria-pressed={value === true}
      >
        Yes
      </Button>
      <Button
        variant={value === false ? 'default' : 'outline'}
        onClick={() => onChange(false)}
        className="flex-1 min-h-[44px]"
        aria-pressed={value === false}
      >
        No
      </Button>
    </div>
  );
}
