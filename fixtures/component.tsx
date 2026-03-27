import React from "react";

interface Props {
  name: string;
  count: number;
}

export function Greeting({ name, count }: Props) {
  if (!name) {
    return <div>No name</div>;
  }

  return (
    <div>
      {count > 0 ? (
        <span>Hello {name}, count: {count}</span>
      ) : (
        <span>Hello {name}</span>
      )}
    </div>
  );
}

export const Counter: React.FC<{ initial: number }> = ({ initial }) => {
  const [count, setCount] = React.useState(initial);

  const increment = () => {
    if (count < 100) {
      setCount(count + 1);
    }
  };

  return (
    <button onClick={increment}>
      Count: {count}
    </button>
  );
};
