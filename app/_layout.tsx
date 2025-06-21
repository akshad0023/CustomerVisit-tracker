// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* The `name` prop MUST match your lowercase filenames */}
      <Stack.Screen name="index" />
      <Stack.Screen name="owner" />
      <Stack.Screen name="customerinfo" options={{ headerShown: true, title: "Customer Info" }} />
      <Stack.Screen name="visithistory" options={{ headerShown: true, title: "Today's Visits" }} />
      <Stack.Screen name="employeeshift" options={{ headerShown: true, title: "Employee Shift" }} />
      <Stack.Screen name="machinetracker" options={{ headerShown: true, title: "Shift History" }} />
      <Stack.Screen name="profitloss" options={{ headerShown: true, title: "Profit & Loss" }} />
      
      {/* 
        It's better to handle logout with a function press rather than a dedicated screen.
        If your logout.tsx file is just for logging out, you can probably delete it and 
        handle the logic inside the menu button on the index.tsx page.
        If you want to keep it, you can add it here.
      */}
      {/* <Stack.Screen name="logout" /> */}
    </Stack>
  );
}