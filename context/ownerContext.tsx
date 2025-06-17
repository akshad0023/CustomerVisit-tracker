import React, { createContext, ReactNode, useContext, useState } from 'react';

type OwnerContextType = {
  ownerId: string | null;
  setOwnerId: (id: string | null) => void;
};

const OwnerContext = createContext<OwnerContextType>({
  ownerId: null,
  setOwnerId: () => {},
});

export const OwnerProvider = ({ children }: { children: ReactNode }) => {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  return (
    <OwnerContext.Provider value={{ ownerId, setOwnerId }}>
      {children}
    </OwnerContext.Provider>
  );
};

export const useOwner = () => useContext(OwnerContext);