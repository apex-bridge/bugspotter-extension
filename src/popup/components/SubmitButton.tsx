interface Props {
  status: 'idle' | 'loading' | 'success' | 'error';
  disabled: boolean;
  onClick: () => void;
}

export function SubmitButton({ status, disabled, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || status === 'loading'}
      className={`w-full mt-4 py-2 rounded text-sm font-medium transition-colors ${
        disabled || status === 'loading'
          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
          : 'bg-blue-600 hover:bg-blue-700 text-white'
      }`}
    >
      {status === 'loading' ? 'Submitting...' : 'Submit Bug Report'}
    </button>
  );
}
