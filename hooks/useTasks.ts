// hooks/useTaskStatus.ts
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

const API_BASE_URL = "http://localhost:8000";

export const useTaskStatus = (taskId: string) => {
  return useQuery({
    queryKey: ["taskStatus", taskId],
    queryFn: async () => {
      try {
        console.log(`Checking status for task ${taskId}`);
        const response = await axios.get(
          `${API_BASE_URL}/task-status/${taskId}`
        );
        console.log(`Task ${taskId} status:`, response.data);
        return response.data;
      } catch (error) {
        console.error(`Error checking task ${taskId} status:`, error);
        throw error;
      }
    },
    enabled: !!taskId,
    refetchInterval: (data) => {
      // Check status every 3 seconds until task is completed or failed
      return data?.isActive() || data?.isDisabled() ? false : 3000;
    },
  });
};