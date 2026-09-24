import { useState, type FormEvent } from 'react';
import { createClass } from './classService';

export function CreateClassForm({
  workspaceId,
  onCreated,
  onCancel,
}: {
  workspaceId: string;
  onCreated: (classId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length > 120) {
      setError('Enter a class name between 1 and 120 characters.');
      return;
    }

    setPending(true);
    setError(null);
    const result = await createClass({ workspaceId, name: normalizedName });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onCreated(result.value.id);
  };

  return (
    <section className="form-panel" aria-labelledby="create-class-title">
      <div className="panel-heading">
        <h2 id="create-class-title">New class</h2>
        <button className="text-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <form
        className="class-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label htmlFor="new-class-name">Class name</label>
        <input
          id="new-class-name"
          name="name"
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
          maxLength={120}
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'new-class-error' : 'new-class-hint'}
          disabled={pending}
        />
        <p className="field-hint" id="new-class-hint">
          Use a name students will recognize. You can change it later.
        </p>
        {error && (
          <p className="form-error" id="new-class-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="button button-primary"
            type="submit"
            disabled={pending || !name.trim() || name.trim().length > 120}
          >
            {pending ? 'Creating…' : 'Create class'}
          </button>
        </div>
      </form>
    </section>
  );
}
