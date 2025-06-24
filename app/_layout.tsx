// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/*
        The `name` prop MUST match the filename in the 'app' directory (without .tsx).
        This is the crucial link between the route and the file.
      */}
      <Stack.Screen name="index" />
      <Stack.Screen name="owner" />
      
      {/*
        The pages below will get an automatic header and back button from the Stack Navigator.
        This is better UX than building a custom header on every single page.
      */}
      <Stack.Screen 
        name="customerinfo" 
        options={{ headerShown: true, title: "Customer Info" }} 
      />
      <Stack.Screen 
        name="visithistory" 
        options={{ headerShown: true, title: "Today's Visits" }} 
      />
      <Stack.Screen 
        name="employeeshift" 
        options={{ headerShown: true, title: "Employee Shift" }} 
      />
      <Stack.Screen 
        name="machinetracker" 
        options={{ headerShown: true, title: "Shift History" }} 
      />
      <Stack.Screen 
        name="profitloss" 
        options={{ headerShown: true, title: "Profit & Loss" }} 
      />
      
      
      {/* Register the new bulksms screen so the router knows it exists. */}
      <Stack.Screen 
        name="bulksms" 
        options={{ 
          headerShown: true, 
          title: "Send Bulk Message",
          // You could also make it a full-screen modal
          // presentation: 'modal', 
        }} 
      />
      {/* --- End of Fix --- */}
      
    </Stack>
  );
}