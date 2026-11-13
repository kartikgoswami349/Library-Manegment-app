!macro customInstall
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Ashram Library LAN Sync"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="Ashram Library LAN Sync" dir=in action=allow program="$INSTDIR\Ashram Library.exe" protocol=TCP localport=45831-45833,45858-45860 profile=private'
  Pop $0
  StrCmp $0 "0" firewall_rule_added
  MessageBox MB_ICONEXCLAMATION|MB_OK "Windows Firewall did not allow the Ashram Library LAN rule to be added. Run the installer as administrator, then allow inbound TCP ports 45831-45833 and 45858-45860 on Private networks. Set your trusted Wi-Fi network to Private before pairing."
  Goto firewall_rule_done
firewall_rule_added:
  DetailPrint "Added the Ashram Library LAN sync firewall rule for Private networks."
firewall_rule_done:
!macroend

!macro customUnInstall
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="Ashram Library LAN Sync"'
  Pop $0
!macroend
